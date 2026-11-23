-- ============================================================================
-- Nailed It: cancelling bookings (customer or freelancer), with an optional message
-- Applied to the project as migration "booking_cancellation". Kept here for reference.
--
-- cancel_appointment(p_id, p_reason) replaces cancel_appointment(p_id) (old calls still work):
--   - either person can cancel a confirmed booking, or a pending request, before it starts
--   - the optional message is saved (appointments.cancel_reason) and, like every cancellation,
--     posted in their chat so the other person sees it; the push notification is unchanged
-- ============================================================================

alter table public.appointments add column if not exists cancel_reason text;
alter table public.appointments drop constraint if exists appointments_cancel_reason_check;
alter table public.appointments add constraint appointments_cancel_reason_check
  check (cancel_reason is null or char_length(cancel_reason) <= 300);

drop function if exists public.cancel_appointment(uuid);

create or replace function public.cancel_appointment(p_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  me uuid := auth.uid();
  v_row appointments;
  v_reason text := nullif(left(trim(p_reason), 300), '');
  v_was text;
begin
  select * into v_row from public.appointments where id = p_id for update;
  if not found or me is null or me not in (v_row.customer_id, v_row.creator_id) then
    raise exception 'Booking not found.';
  end if;
  if v_row.status not in ('confirmed', 'pending')
     or public.appointment_starts_at(v_row.appointment_date::date, v_row.start_time::time) <= now() then
    raise exception 'This booking can no longer be cancelled.';
  end if;
  v_was := v_row.status;

  update public.appointments
     set status = 'cancelled',
         cancelled_by = me,
         cancelled_at = now(),
         cancel_reason = v_reason
   where id = p_id;

  insert into public.messages (chat_id, sender_id, text)
  values (
    public.chat_id_for(v_row.creator_id, v_row.customer_id),
    me,
    case
      when v_was = 'pending' and me = v_row.customer_id then 'Withdrew the booking request: '
      when v_was = 'pending' then 'Declined the booking request: '
      else 'Cancelled the booking: '
    end
    || public.appointment_services_text(v_row.services) || ' · '
    || public.appointment_when(v_row.appointment_date, v_row.start_time)
    || coalesce(E'\n' || v_reason, ''));
end;
$function$;

revoke all on function public.cancel_appointment(uuid, text) from public, anon;
grant execute on function public.cancel_appointment(uuid, text) to authenticated;
