-- Additive JSON state migration: retain every legacy journey/history record.
-- Imported older version-1 backups may still omit quarterDays; domain defaults support them.
UPDATE campaigns SET public_state=json_set(public_state,'$.quarterDays',json_object(
 'settings',json_object('weatherMode','Manual','leader',json_extract(public_state,'$.journey.assignments.leader'),'watch',json_extract(public_state,'$.journey.assignments.watch'),'hike','Manual review'),
 'active',NULL,'history',json('[]'),'rolls',json('[]')
)) WHERE json_type(public_state,'$.quarterDays') IS NULL;
