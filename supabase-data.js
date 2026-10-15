(function () {
  const client = () => window.jasgSupabase;

  async function saveEquipment(vehicleId, features) {
    let equipment = [];
    if (features.length) {
      const catalog = await client().from('equipment_catalog')
        .upsert(features.map(name => ({ name })), { onConflict: 'name', ignoreDuplicates: true });
      if (catalog.error) return catalog;
      const selected = await client().from('equipment_catalog').select('id, name').in('name', features);
      if (selected.error) return selected;
      equipment = selected.data;
      if (equipment.length !== features.length) {
        return { error: new Error('No se pudo verificar todo el equipamiento seleccionado.') };
      }
    }

    const existing = await client().from('vehicle_equipment').select('equipment_id').eq('vehicle_id', vehicleId);
    if (existing.error) return existing;
    // Primero guardar las nuevas relaciones; conservar las anteriores si falla.
    if (equipment.length) {
      const linked = await client().from('vehicle_equipment').upsert(
        equipment.map(item => ({ vehicle_id: vehicleId, equipment_id: item.id })),
        { onConflict: 'vehicle_id,equipment_id', ignoreDuplicates: true }
      );
      if (linked.error) return linked;
    }
    const selectedIds = new Set(equipment.map(item => item.id));
    const removedIds = existing.data.map(item => item.equipment_id).filter(id => !selectedIds.has(id));
    if (removedIds.length) {
      const removed = await client().from('vehicle_equipment').delete()
        .eq('vehicle_id', vehicleId).in('equipment_id', removedIds);
      if (removed.error) return removed;
    }
    return { error: null };
  }

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
      const features = [...new Set((Array.isArray(vehicle.features) ? vehicle.features : [])
        .filter(feature => typeof feature === 'string').map(feature => feature.trim()).filter(Boolean))];
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
      const images = [];
      for (const image of (vehicle.images || [])) {
        if (!String(image).startsWith('data:image')) {
          images.push(image);
          continue;
        }
        const match = String(image).match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
        if (!match) continue;
        const blob = await (await fetch(image)).blob();
        const extension = match[1].split('/')[1].replace('jpeg', 'jpg');
        const path = `${vehicleId}/${crypto.randomUUID()}.${extension}`;
        const upload = await client().storage.from('vehicle-images').upload(path, blob, { contentType: match[1], upsert: false });
        if (upload.error) return { data: null, error: upload.error };
        const publicUrl = client().storage.from('vehicle-images').getPublicUrl(path).data.publicUrl;
        images.push(publicUrl);
      }
      // Conservar las fotos anteriores hasta terminar de subir las nuevas.
      const removed = await client().from('vehicle_images').delete().eq('vehicle_id', vehicleId);
      if (removed.error) return { data: null, error: removed.error };
      if (images.length) {
        const inserted = await client().from('vehicle_images').insert(images.map((image_url, sort_order) => ({ vehicle_id: vehicleId, image_url, sort_order })));
        if (inserted.error) return { data: null, error: inserted.error };
      }
      const equipment = await saveEquipment(vehicleId, features);
      if (equipment.error) return { data: null, error: equipment.error };
      return { data: { ...vehicle, id: vehicleId, images, features }, error: null };
    }
  };
})();
