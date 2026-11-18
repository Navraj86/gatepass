-- Correctness audit after a load run. Every "problems" column must be 0.
--   docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v event_id=<id>' < load/audit.sql
-- Without -v event_id it audits every event.
\if :{?event_id}
\else
  \set event_id ''
\endif

with scope as (
  select id from events where :'event_id' = '' or id::text = :'event_id'
)
select 'seats with more than one valid ticket' as check, count(*) as problems
from (
  select seat_id from tickets
  where status = 'valid' and event_id in (select id from scope)
  group by seat_id having count(*) > 1
) t
union all
select 'sold seats without exactly one valid ticket', count(*)
from seats s
where s.event_id in (select id from scope) and s.status = 'sold'
  and (select count(*) from tickets t where t.seat_id = s.id and t.status = 'valid') <> 1
union all
select 'valid tickets on seats that are not sold', count(*)
from tickets t join seats s on s.id = t.seat_id
where t.event_id in (select id from scope) and t.status = 'valid' and s.status <> 'sold'
union all
select 'paid orders without a ticket for every seat', count(*)
from orders o
where o.event_id in (select id from scope) and o.status = 'paid'
  and (select count(*) from order_items i where i.order_id = o.id)
   <> (select count(*) from tickets t where t.order_id = o.id and t.status = 'valid')
union all
select 'tickets on orders that are not paid', count(*)
from tickets t join orders o on o.id = t.order_id
where t.event_id in (select id from scope) and t.status = 'valid' and o.status <> 'paid'
union all
select 'more than one pending order per buyer and event', count(*)
from (
  select user_id from orders
  where status = 'pending' and event_id in (select id from scope)
  group by user_id, event_id having count(*) > 1
) p;

-- For the results table: what the run actually sold.
with scope as (
  select id from events where :'event_id' = '' or id::text = :'event_id'
)
select
  (select count(*) from seats where event_id in (select id from scope) and status = 'sold') as seats_sold,
  (select count(*) from orders where event_id in (select id from scope) and status = 'paid') as paid_orders,
  (select count(*) from orders where event_id in (select id from scope) and status = 'refunding') as refunding_orders;
