ALTER TABLE products ADD COLUMN content_sections_json TEXT NOT NULL DEFAULT '[]';
--> statement-breakpoint
ALTER TABLE product_attribute_values ADD COLUMN group_title TEXT NOT NULL DEFAULT '';
