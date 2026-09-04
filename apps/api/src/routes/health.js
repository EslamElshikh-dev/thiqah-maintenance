export async function healthRoutes(app,ctx){
  const {db,redis}=ctx;
  app.get('/health/live',async()=>({ok:true}));
  app.get('/health/ready',async(request,reply)=>{
    try{
      await db.query('SELECT 1');
      if(redis) { if(redis.status==='wait') await redis.connect(); await redis.ping(); }
      return {ok:true,database:true,redis:!!redis};
    }catch(error){ reply.code(503); return {ok:false,error:'NOT_READY'}; }
  });
}
