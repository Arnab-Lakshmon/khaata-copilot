alter table public.invoices
  add column if not exists last_reminded_at timestamptz;
