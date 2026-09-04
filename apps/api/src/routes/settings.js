export async function settingsRoutes(app,ctx){
  const {db}=ctx;
  app.get('/v1/settings',async()=>{
    const settings=await db.query(`SELECT key,value FROM thiqah.app_settings`);
    const services=await db.query(`SELECT id,code,name_ar,description_ar FROM thiqah.services WHERE active=true ORDER BY sort_order,name_ar`);
    const areas=await db.query(`SELECT id,name_ar,city FROM thiqah.service_areas WHERE active=true ORDER BY name_ar`);
    return {ok:true,settings:Object.fromEntries(settings.rows.map(r=>[r.key,r.value])),services:services.rows,serviceAreas:areas.rows};
  });
}
