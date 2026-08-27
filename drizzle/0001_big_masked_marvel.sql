CREATE TABLE `order_items` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`product_id` text NOT NULL,
	`slug` text NOT NULL,
	`sku` text DEFAULT '' NOT NULL,
	`title` text NOT NULL,
	`quantity` integer NOT NULL,
	`unit_price_minor` integer NOT NULL,
	`line_total_minor` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `order_items_order_idx` ON `order_items` (`order_id`);--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`order_number` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`payment_status` text DEFAULT 'not_collected' NOT NULL,
	`customer_name` text NOT NULL,
	`customer_email` text NOT NULL,
	`customer_phone` text NOT NULL,
	`address_line` text NOT NULL,
	`city` text NOT NULL,
	`postcode` text NOT NULL,
	`delivery_method` text NOT NULL,
	`currency` text DEFAULT 'GBP' NOT NULL,
	`subtotal_minor` integer NOT NULL,
	`delivery_minor` integer NOT NULL,
	`total_minor` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `orders_order_number_unique` ON `orders` (`order_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `orders_idempotency_key_unique` ON `orders` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `orders_status_created_idx` ON `orders` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `orders_email_created_idx` ON `orders` (`customer_email`,`created_at`);--> statement-breakpoint
ALTER TABLE `products` ADD `sku` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `description` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `compare_at_price_minor` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `stock_quantity` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `reserved_quantity` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `products_sku_idx` ON `products` (`sku`);
--> statement-breakpoint
INSERT OR IGNORE INTO `products` (`id`,`slug`,`title`,`brand`,`category`,`sku`,`description`,`placement`,`price_minor`,`compare_at_price_minor`,`stock_quantity`,`reserved_quantity`,`image_url`,`visible`) VALUES
('phone-1','nova-128','گوشی هوشمند Nova 128GB','Nova','digital','NOVA-128','گوشی هوشمند منتخب با حافظه ۱۲۸ گیگابایت.','digital-picks',24999,0,25,0,'',1),
('phone-2','orbit-pro','گوشی هوشمند Orbit Pro','Orbit','digital','ORBIT-PRO','گوشی هوشمند حرفه‌ای Orbit.','trending',39999,42999,18,0,'',1),
('laptop-1','vertex-14','لپ‌تاپ سبک Vertex 14','Vertex','digital','VERTEX-14','لپ‌تاپ سبک برای کار روزمره.','digital-picks',64999,0,12,0,'',1),
('laptop-2','vertex-air','لپ‌تاپ کاری Vertex Air','Vertex','digital','VERTEX-AIR','لپ‌تاپ کاری سبک Vertex.','digital-picks',79999,0,0,0,'',1),
('audio-1','sonic-one','هدفون بی‌سیم Sonic One','Sonic','digital','SONIC-ONE','هدفون بی‌سیم منتخب با طراحی روزمره.','special-offers',6999,8999,30,0,'',1),
('audio-2','sonic-mini','اسپیکر قابل حمل Sonic Mini','Sonic','digital','SONIC-MINI','اسپیکر قابل حمل برای استفاده روزمره.','digital-picks',7999,0,20,0,'',1),
('power-1','volt-65w','شارژر سریع Volt 65W','Volt','digital','VOLT-65W','شارژر سریع ۶۵ وات.','digital-picks',3999,0,40,0,'',1),
('power-2','volt-20k','پاوربانک Volt 20K','Volt','digital','VOLT-20K','پاوربانک با ظرفیت بالا.','digital-picks',4499,0,35,0,'',1),
('home-1','haven-kettle','کتری برقی Haven','Haven','home-kitchen','HAVEN-KETTLE','کتری برقی کاربردی برای آشپزخانه.','home-picks',2999,0,25,0,'',1),
('home-2','haven-vacuum','جارو شارژی Haven Lite','Haven','home-kitchen','HAVEN-VACUUM','جارو شارژی سبک برای خانه.','special-offers',11999,14999,14,0,'',1),
('home-3','loom-desk-lamp','چراغ رومیزی Loom','Loom','home-kitchen','LOOM-LAMP','چراغ رومیزی مینیمال.','home-picks',3499,0,22,0,'',1),
('fashion-1','move-everyday','کفش روزمره Move','Move','fashion','MOVE-EVERYDAY','کفش مناسب استفاده روزمره.','special-offers',5499,6999,28,0,'',1),
('fashion-2','loom-minimal-bag','کیف مینیمال Loom','Loom','fashion','LOOM-BAG','کیف مینیمال برای استفاده روزمره.','trending',4999,0,19,0,'',1),
('fashion-3','north-shirt','پیراهن روزمره North','North','fashion','NORTH-SHIRT','پیراهن سبک روزمره.','trending',4299,0,24,0,'',1),
('beauty-1','pure-skincare-set','ست مراقبت پوست Pure','Pure','beauty-health','PURE-SKIN-SET','ست منتخب مراقبت پوست.','special-offers',3299,4299,32,0,'',1),
('beauty-2','pure-hair-mask','ماسک موی Pure Care','Pure','beauty-health','PURE-HAIR-MASK','ماسک مو برای مراقبت روزمره.','trending',1899,0,36,0,'',1),
('beauty-3','aura-daily','عطر روزانه Aura','Aura','beauty-health','AURA-DAILY','عطر سبک برای استفاده روزانه.','trending',4599,0,0,0,'',1),
('sports-1','trek-28','کوله سفر Trek 28L','Trek','sports-travel','TREK-28','کوله ۲۸ لیتری مناسب سفر.','trending',5299,0,16,0,'',1),
('kids-1','play-lab','ست ساختنی Play Lab','Play','kids-entertainment','PLAY-LAB','ست ساختنی و سرگرمی کودک.','trending',2499,0,21,0,'',1),
('auto-1','drive-tool-kit','کیت ابزار Drive 40','Drive','automotive-tools','DRIVE-40','کیت ابزار کاربردی ۴۰ تکه.','trending',5999,0,13,0,'',1),
('grocery-1','roast-daily','پک قهوه روزانه Roast','Roast','grocery','ROAST-DAILY','پک قهوه مناسب مصرف روزانه.','trending',1299,0,50,0,'',1);
