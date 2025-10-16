CREATE OR REPLACE FUNCTION set_org(org uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('app.org_id', org::text, true);
$$;


