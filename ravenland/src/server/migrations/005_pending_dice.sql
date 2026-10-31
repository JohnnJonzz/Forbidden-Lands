-- Add pending dice without rewriting or removing existing submitted roll history.
UPDATE campaigns SET public_state=json_set(public_state,'$.dice',json('[]')) WHERE json_type(public_state,'$.dice') IS NULL;
