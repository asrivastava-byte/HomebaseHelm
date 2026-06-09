class CreateAdminUsers < ActiveRecord::Migration[7.2]
  def change
    create_table :admin_users do |t|
      t.string :email,          null: false
      t.string :full_name,      null: false
      t.string :role,           null: false
      t.string :stytch_subject
      t.timestamps
    end
    add_index :admin_users, :email, unique: true
    add_index :admin_users, :role
  end
end
