class CreateAuditEvents < ActiveRecord::Migration[7.2]
  def change
    create_table :audit_events do |t|
      t.bigint   :admin_user_id, null: false
      t.string   :role,          null: false
      t.string   :workflow,      null: false
      t.string   :action,        null: false
      t.string   :resource_type, null: false
      t.bigint   :resource_id,   null: false
      t.jsonb    :payload_before
      t.jsonb    :payload_after
      t.string   :request_id,    null: false
      t.string   :ip
      t.datetime :occurred_at,   null: false
      t.timestamps
    end
    add_index :audit_events, [:resource_type, :resource_id]
    add_index :audit_events, :admin_user_id
    add_index :audit_events, :occurred_at
  end
end
