export class ThiqahApiClient {
  constructor({ baseUrl, clientType='web' }) {
    this.baseUrl=baseUrl.replace(/\/$/,'');
    this.clientType=clientType;
    this.csrfToken=null;
    this.mobileSessionToken=null;
  }

  async request(path,{method='GET',body,headers={}}={}){
    const finalHeaders={Accept:'application/json',...headers};
    if(body!==undefined) finalHeaders['Content-Type']='application/json';
    if(this.csrfToken && method!=='GET') finalHeaders['X-CSRF-Token']=this.csrfToken;
    if(this.mobileSessionToken) finalHeaders.Authorization=`Bearer ${this.mobileSessionToken}`;
    const response=await fetch(`${this.baseUrl}${path}`,{
      method,headers:finalHeaders,credentials:this.clientType==='web'?'include':'omit',body:body===undefined?undefined:JSON.stringify(body)
    });
    const data=await response.json().catch(()=>({ok:false,error:'INVALID_RESPONSE'}));
    if(!response.ok||data.ok===false){const error=new Error(data.message||data.error||'Request failed');error.status=response.status;error.code=data.error;throw error;}
    return data;
  }

  adoptSession(data){
    if(data.csrfToken) this.csrfToken=data.csrfToken;
    if(data.sessionToken) this.mobileSessionToken=data.sessionToken;
    return data;
  }

  startRegistration(input){return this.request('/v1/auth/customer/register/start',{method:'POST',body:input});}
  async verifyRegistration(input){return this.adoptSession(await this.request('/v1/auth/customer/register/verify',{method:'POST',body:{...input,clientType:this.clientType}}));}
  async loginCustomer(identifier,password){return this.adoptSession(await this.request('/v1/auth/customer/login',{method:'POST',body:{identifier,password,clientType:this.clientType}}));}
  async loginTechnician(phone,password){return this.adoptSession(await this.request('/v1/auth/technician/login',{method:'POST',body:{phone,password,clientType:this.clientType}}));}
  async startAdminLogin(username,password){return this.request('/v1/auth/admin/login',{method:'POST',body:{username,password}});}
  async verifyAdminMfa(challengeToken,code){return this.adoptSession(await this.request('/v1/auth/admin/mfa/verify',{method:'POST',body:{challengeToken,code,clientType:this.clientType}}));}
  logout(){return this.request('/v1/auth/logout',{method:'POST',body:{}});}

  startGuestOrder(order){return this.request('/v1/orders/guest/start',{method:'POST',body:order});}
  verifyGuestOrder({challengeId,phone,otp,idempotencyKey}){return this.request('/v1/orders/guest/verify',{method:'POST',headers:{'Idempotency-Key':idempotencyKey},body:{challengeId,phone,otp}});}
  createCustomerOrder(order,idempotencyKey){return this.request('/v1/orders',{method:'POST',headers:{'Idempotency-Key':idempotencyKey},body:order});}
  track(orderNumber,trackingToken){return this.request(`/v1/orders/track?orderNumber=${encodeURIComponent(orderNumber)}&token=${encodeURIComponent(trackingToken)}`);}

  async uploadOrderMedia({orderId,kind,file}){
    const intent=await this.request(`/v1/orders/${encodeURIComponent(orderId)}/media/upload-intent`,{method:'POST',body:{kind,mimeType:file.type,sizeBytes:file.size}});
    const shaBuffer=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());
    const sha256Hex=[...new Uint8Array(shaBuffer)].map(b=>b.toString(16).padStart(2,'0')).join('');
    const upload=await fetch(intent.uploadUrl,{method:'PUT',headers:{'Content-Type':file.type},body:file});
    if(!upload.ok) throw new Error('Direct media upload failed');
    return this.request(`/v1/orders/${encodeURIComponent(orderId)}/media/complete`,{method:'POST',body:{intentId:intent.intentId,sha256Hex}});
  }
}
