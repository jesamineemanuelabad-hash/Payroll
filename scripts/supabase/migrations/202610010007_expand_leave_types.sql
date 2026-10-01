alter table public.leave_requests
  drop constraint if exists leave_requests_leave_type_check;

alter table public.leave_requests
  add constraint leave_requests_leave_type_check
  check (leave_type in (
    'vawc',
    'emergency',
    'bereavement',
    'paternity',
    'annual',
    'unpaid',
    'maternity',
    'magna_carta_women',
    'calamity',
    'solo_parent',
    'vacation',
    'sick',
    'service_incentive',
    'other'
  ));

comment on column public.leave_requests.is_paid is
  'Per-request paid/unpaid decision used by payroll; leave-type entitlement and accrual policies are not implied by this flag.';
