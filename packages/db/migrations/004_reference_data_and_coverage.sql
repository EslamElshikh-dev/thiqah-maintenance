BEGIN;
SET search_path TO thiqah, public;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS service_area_id uuid REFERENCES service_areas(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS orders_service_area_idx ON orders(service_area_id, status, appointment_date);

INSERT INTO services(code,name_ar,description_ar,sort_order) VALUES
('plumbing','سباكة','أعمال السباكة وكشف وإصلاح التسربات',10),
('electrical','كهرباء','أعمال الكهرباء المنزلية والأعطال والإنارة',20),
('ac','تكييف','صيانة وتنظيف وإصلاح وتركيب أجهزة التكييف',30),
('general','صيانة عامة','إصلاحات منزلية عامة وأعمال متعددة',40),
('buildings','صيانة شقق ومباني','صيانة دورية وتشغيل للشقق والمباني',50)
ON CONFLICT (code) DO UPDATE SET name_ar=EXCLUDED.name_ar,description_ar=EXCLUDED.description_ar,sort_order=EXCLUDED.sort_order,active=true;

INSERT INTO service_areas(name_ar,city) VALUES
('الياسمين','الرياض'),('الملقا','الرياض'),('النرجس','الرياض'),('العقيق','الرياض'),('الصحافة','الرياض'),
('الروضة','الرياض'),('الربوة','الرياض'),('قرطبة','الرياض'),('غرناطة','الرياض'),('اشبيلية','الرياض')
ON CONFLICT (name_ar) DO UPDATE SET active=true,city=EXCLUDED.city;

INSERT INTO app_settings(key,value) VALUES
('brand', '{"nameAr":"ثقة للصيانة المنزلية","taglineAr":"طلب صيانة أوضح، ومتابعة أسهل"}'::jsonb),
('city', '"الرياض"'::jsonb),
('vatRate', '15'::jsonb),
('previewMode', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;

COMMIT;
