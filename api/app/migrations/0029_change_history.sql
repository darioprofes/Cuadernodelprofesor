CREATE TABLE change_history (
 id BIGSERIAL PRIMARY KEY, batch_id TEXT NOT NULL, table_name TEXT NOT NULL, row_key TEXT NOT NULL,
 class_id TEXT, course_id TEXT, label TEXT NOT NULL,
 before_data JSONB, after_data JSONB,
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(), undone_at TIMESTAMPTZ
);
CREATE INDEX history_batch ON change_history(batch_id,id);
CREATE INDEX history_class ON change_history(class_id,id);
CREATE FUNCTION record_gradebook_history() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE b JSONB; a JSONB; r JSONB; cid TEXT; coid TEXT; title TEXT; key TEXT; bid TEXT;
BEGIN
 IF current_setting('profe.history_disabled',true)='on' THEN RETURN NULL; END IF;
 IF TG_OP<>'INSERT' THEN b=to_jsonb(OLD); END IF;
 IF TG_OP<>'DELETE' THEN a=to_jsonb(NEW); END IF;
 IF TG_OP='UPDATE' AND b-'updated_at'-'created_at'=a-'updated_at'-'created_at' THEN RETURN NULL; END IF;
 r=COALESCE(a,b); cid=r->>'class_id'; coid=r->>'course_id';
 key=r->>'id'; title=COALESCE(r->>'name',r->>'code',r->>'subject','Nota');
 IF TG_TABLE_NAME='courses' THEN coid=r->>'id'; END IF;
 IF TG_TABLE_NAME='grades' THEN
  key=(r->>'enrollment_id')||'|'||(r->>'assignment_id');
  SELECT class_id::text,name INTO cid,title FROM assignments WHERE id=(r->>'assignment_id')::uuid;
 END IF;
 bid=current_setting('profe.history_batch',true);
 IF bid IS NULL OR bid='' THEN
  bid=gen_random_uuid()::text;
  PERFORM set_config('profe.history_batch',bid,true);
 END IF;
 INSERT INTO change_history(batch_id,table_name,row_key,class_id,course_id,label,before_data,after_data)
 VALUES(bid,TG_TABLE_NAME,key,cid,coid,COALESCE(title,'Nota de tarea eliminada'),b,a);
 RETURN NULL;
END $$;
CREATE TRIGGER history_courses AFTER UPDATE OR DELETE ON courses FOR EACH ROW EXECUTE FUNCTION record_gradebook_history();
CREATE TRIGGER history_evaluation_criteria AFTER UPDATE OR DELETE ON evaluation_criteria FOR EACH ROW EXECUTE FUNCTION record_gradebook_history();
CREATE TRIGGER history_evaluation_tools AFTER UPDATE OR DELETE ON evaluation_tools FOR EACH ROW EXECUTE FUNCTION record_gradebook_history();
CREATE TRIGGER history_categories AFTER UPDATE OR DELETE ON categories FOR EACH ROW EXECUTE FUNCTION record_gradebook_history();
CREATE TRIGGER history_assignments AFTER UPDATE OR DELETE ON assignments FOR EACH ROW EXECUTE FUNCTION record_gradebook_history();
CREATE TRIGGER history_grades AFTER INSERT OR UPDATE OR DELETE ON grades FOR EACH ROW EXECUTE FUNCTION record_gradebook_history();
