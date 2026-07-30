-- Store confidence_score as percentage points (0-100) in both related tables.
alter table public.transactions
  alter column confidence_score type numeric(5,2)
  using case
    when confidence_score between 0 and 1 then round(confidence_score * 100, 2)
    else round(confidence_score, 2)
  end;

alter table public.reconciliation_match_decisions
  alter column confidence_score type numeric(5,2)
  using case
    when confidence_score between 0 and 1 then round(confidence_score * 100, 2)
    else round(confidence_score, 2)
  end;
