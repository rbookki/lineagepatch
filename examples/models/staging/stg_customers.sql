select
  customer_id,
  email_address,
  email_address as cust_email, -- compatibility window
  customer_status
from {{ source('order_entry', 'customers') }}
