export async function healthRoutes(app,ctx){
  const {db,redis,storage,sms,email,coreStagingMode}=ctx;
  app.get('/health/live',async()=>({ok:true}));
  app.get('/health/ready',async(request,reply)=>{
    try{
      await db.query('SELECT 1');
      if(redis) { if(redis.status==='wait') await redis.connect(); await redis.ping(); }
      const dependencies={
        storage:storage?.status!=='unavailable',
        sms:sms?.status!=='unavailable',
        email:email?.status!=='unavailable'
      };
      return {
        ok:true,
        database:true,
        redis:!!redis,
        mode:coreStagingMode?'core-staging':'full',
        dependencies
      };
    }catch(error){ reply.code(503); return {ok:false,error:'NOT_READY'}; }
  });
}
