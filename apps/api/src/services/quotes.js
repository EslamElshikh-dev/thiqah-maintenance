import { randomToken } from '../lib/crypto.js';
import { transitionOrderTx } from './orders.js';
import { badRequest, forbidden, notFound, conflict } from '../lib/http.js';

function money(value) {
  const n=Number(value);
  if(!Number.isFinite(n)||n<0) throw badRequest('INVALID_AMOUNT','Invalid amount');
  return Math.round(n*100)/100;
}

export async function createAndSendQuote({db,actor,orderId,items,notes,validUntil,context}){
  if(actor.actor_type!=='admin') throw forbidden();
  if(!Array.isArray(items)||items.length<1||items.length>50) throw badRequest('INVALID_QUOTE_ITEMS','Quote requires 1-50 items');
  const normalized=items.map((item,index)=>{
    const quantity=Number(item.quantity); const unitPrice=money(item.unitPrice);
    if(!Number.isFinite(quantity)||quantity<=0||quantity>100000) throw badRequest('INVALID_QUANTITY','Invalid quantity');
    const description=String(item.description||'').trim(); if(description.length<2||description.length>500) throw badRequest('INVALID_DESCRIPTION','Invalid item description');
    return {description,quantity,unitPrice,lineTotal:money(quantity*unitPrice),sortOrder:index};
  });
  if(validUntil && new Date(validUntil)<=new Date()) throw badRequest('INVALID_QUOTE_EXPIRY','Quote expiry must be in the future');
  const subtotal=money(normalized.reduce((s,i)=>s+i.lineTotal,0));
  const taxRate=15;
  const taxAmount=money(subtotal*(taxRate/100));
  const total=money(subtotal+taxAmount);
  return db.tx(async(client)=>{
    const order=(await client.query(`SELECT id,status FROM thiqah.orders WHERE id=$1 FOR UPDATE`,[orderId])).rows[0];
    if(!order) throw notFound('Order not found');
    if(order.status!=='triage') throw conflict('ORDER_NOT_READY_FOR_QUOTE','Order must be in triage before quoting');
    const quoteNumber=`Q-${new Date().getUTCFullYear()}-${randomToken(6).toUpperCase()}`;
    const quote=(await client.query(
      `INSERT INTO thiqah.quotes (quote_number,order_id,status,subtotal,tax_rate,tax_amount,total,valid_until,notes,created_by_admin_id,sent_at)
       VALUES($1,$2,'sent',$3,$4,$5,$6,$7,$8,$9,now()) RETURNING *`,
      [quoteNumber,orderId,subtotal,taxRate,taxAmount,total,validUntil||null,notes||null,actor.actor_id])).rows[0];
    for(const item of normalized){
      await client.query(`INSERT INTO thiqah.quote_items(quote_id,description,quantity,unit_price,line_total,sort_order) VALUES($1,$2,$3,$4,$5,$6)`,[quote.id,item.description,item.quantity,item.unitPrice,item.lineTotal,item.sortOrder]);
    }
    await transitionOrderTx({client,actor,orderId,toStatus:'quoted',reason:'quote_sent',context});
    await client.query(`INSERT INTO thiqah.outbox_events(event_type,aggregate_type,aggregate_id,payload) VALUES('quote.sent','quote',$1,$2::jsonb)`,[quote.id,JSON.stringify({quoteId:quote.id,orderId,total})]);
    return {...quote,items:normalized};
  });
}

export async function approveQuote({db,actor,quoteId,context}){
  if(actor.actor_type!=='customer') throw forbidden();
  return db.tx(async(client)=>{
    const quote=(await client.query(`SELECT q.*,o.customer_id,o.status AS order_status FROM thiqah.quotes q JOIN thiqah.orders o ON o.id=q.order_id WHERE q.id=$1 FOR UPDATE`,[quoteId])).rows[0];
    if(!quote) throw notFound('Quote not found');
    if(quote.customer_id!==actor.actor_id) throw forbidden();
    if(quote.status!=='sent') throw conflict('QUOTE_NOT_APPROVABLE','Quote cannot be approved');
    if(quote.valid_until && new Date(quote.valid_until)<=new Date()) throw conflict('QUOTE_EXPIRED','Quote has expired');
    await client.query(`UPDATE thiqah.quotes SET status='approved',approved_at=now() WHERE id=$1`,[quote.id]);
    await client.query(`INSERT INTO thiqah.customer_approvals(order_id,quote_id,customer_id,decision,ip_prefix_hash,user_agent_hash) VALUES($1,$2,$3,'approved',$4,$5)`,[quote.order_id,quote.id,actor.actor_id,context.ipPrefixHash,context.userAgentHash]);
    await transitionOrderTx({client,actor,orderId:quote.order_id,toStatus:'customer_approved',reason:'quote_approved',context});
    return quote;
  });
}
