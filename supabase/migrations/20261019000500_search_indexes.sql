-- Prefix search (LIKE 'abc%') cannot use a default btree under non-C collations (Supabase's
-- default is en_US.UTF-8). text_pattern_ops indexes make admin search and filters index-backed.
create index if not exists part_units_serial_prefix_idx on public.part_units (serial_number text_pattern_ops);
create index if not exists products_sku_prefix_idx on public.products (lower(sku) text_pattern_ops);
create index if not exists products_part_number_prefix_idx on public.products (lower(part_number) text_pattern_ops);
create index if not exists manufacturing_batches_code_prefix_idx on public.manufacturing_batches (lower(batch_code) text_pattern_ops);
create index if not exists support_cases_reference_prefix_idx on public.support_cases (reference text_pattern_ops);
create index if not exists investigations_reference_prefix_idx on public.investigations (reference text_pattern_ops);
