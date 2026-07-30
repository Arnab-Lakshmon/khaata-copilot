alter table public.transactions
  add column if not exists matched_invoice_id uuid references public.invoices(id),
  add column if not exists match_type text not null default 'unmatched',
  add column if not exists confidence_score numeric(5,2),
  add column if not exists created_at timestamptz not null default now();

create table if not exists public.reconciliation_match_decisions (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  proposed_invoice_id uuid not null references public.invoices(id),
  decision text not null check (decision in ('confirmed', 'rejected')),
  confidence_score numeric(5,2) not null,
  decided_at timestamptz not null default now()
);

create index if not exists reconciliation_match_decisions_transaction_id_idx
  on public.reconciliation_match_decisions(transaction_id);
