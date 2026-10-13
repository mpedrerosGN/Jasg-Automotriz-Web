(function () {
  const client = () => window.jasgSupabase;

  function fromRow(row) {
    return {
      id: row.id,
      brand: row.brand,
      model: row.model,
      year: row.year,
      price: row.price,
      mileage: row.mileage,
      category: row.category,
      transmission: row.transmission,
      fuel: row.fuel,
      status: row.status,
      description: row.description || '',
      youtubeUrl: row.youtube_url || '',
      images: (row.vehicle_images || []).sort((a, b) => a.sort_order - b.sort_order).map(item => item.image_url),
      features: (row.vehicle_equipment || []).map(item => item.equipment_catalog?.name).filter(Boolean)
    };
  }

  window.jasgDb = {
    async listVehicles() {
      if (!client()) return { data: null, error: new Error('Supabase no disponible') };
      return client().from('vehicles')
        .select('*, vehicle_images(image_url, sort_order), vehicle_equipment(equipment_catalog(name))')
        .order('created_at', { ascending: false })
        .then(({ data, error }) => ({ data: data ? data.map(fromRow) : null, error }));
    },

    async saveVehicle(vehicle, userId) {
      if (!client()) return { data: null, error: new Error('Supabase no disponible') };
      const payload = {
        ...(typeof vehicle.id === 'string' && vehicle.id.includes('-') ? { id: vehicle.id } : {}),
        brand: vehicle.brand, model: vehicle.model, year: Number(vehicle.year),
        price: Number(vehicle.price) || 0, mileage: Number(vehicle.mileage) || 0,
        category: vehicle.category, transmission: vehicle.transmission, fuel: vehicle.fuel,
        status: vehicle.status, description: vehicle.description || '',
        youtube_url: vehicle.youtubeUrl || null, created_by: userId || null
      };
      const result = await client().from('vehicles').upsert(payload).select().single();
      if (result.error) return result;
      const vehicleId = result.data.id;
      await client().from('vehicle_images').delete().eq('vehicle_id', vehicleId);
      const images = (vehicle.images || []).filter(image => !String(image).startsWith('data:image'));
      if (images.length) await client().from('vehicle_images').insert(images.map((image_url, sort_order) => ({ vehicle_id: vehicleId, image_url, sort_order })));
      return { data: { ...vehicle, id: vehicleId, images }, error: null };
    }
  };
})();
