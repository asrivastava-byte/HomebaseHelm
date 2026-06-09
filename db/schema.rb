# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[7.2].define(version: 2026_06_09_164920) do
  # These are extensions that must be enabled in order to support this database
  enable_extension "plpgsql"

  create_table "admin_users", force: :cascade do |t|
    t.string "email", null: false
    t.string "full_name", null: false
    t.string "role", null: false
    t.string "stytch_subject"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["email"], name: "index_admin_users_on_email", unique: true
    t.index ["role"], name: "index_admin_users_on_role"
  end

  create_table "audit_events", force: :cascade do |t|
    t.bigint "admin_user_id", null: false
    t.string "role", null: false
    t.string "workflow", null: false
    t.string "action", null: false
    t.string "resource_type", null: false
    t.bigint "resource_id", null: false
    t.jsonb "payload_before"
    t.jsonb "payload_after"
    t.string "request_id", null: false
    t.string "ip"
    t.datetime "occurred_at", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["admin_user_id"], name: "index_audit_events_on_admin_user_id"
    t.index ["occurred_at"], name: "index_audit_events_on_occurred_at"
    t.index ["resource_type", "resource_id"], name: "index_audit_events_on_resource_type_and_resource_id"
  end
end
