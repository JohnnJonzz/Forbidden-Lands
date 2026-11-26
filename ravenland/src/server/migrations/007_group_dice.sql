-- Add group settings without changing existing dice, activity outcomes or push consequences.
UPDATE campaigns SET public_state=json_set(public_state,'$.diceGroups',json_object('coordinatorId',json_extract(public_state,'$.characters[0].id'),'batches',json('[]'))) WHERE json_type(public_state,'$.diceGroups') IS NULL;
