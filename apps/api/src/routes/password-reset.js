import { requestContext } from '../lib/request-context.js';
import { requestPasswordReset, resetPassword } from '../services/password-reset.js';

export async function passwordResetRoutes(app,ctx){
  const {db,config,email}=ctx;
  app.post('/v1/auth/password/forgot',{config:{rateLimit:{max:5,timeWindow:'15 minutes'}}},async(request)=>{
    await requestPasswordReset({db,config,emailProvider:email,role:request.body?.role,email:request.body?.email,context:requestContext(config,request)});
    return {ok:true,message:'If an eligible account exists, reset instructions will be sent.'};
  });
  app.post('/v1/auth/password/reset',{config:{rateLimit:{max:10,timeWindow:'15 minutes'}}},async(request)=>{
    await resetPassword({db,config,role:request.body?.role,token:request.body?.token,newPassword:request.body?.newPassword});
    return {ok:true};
  });
}
