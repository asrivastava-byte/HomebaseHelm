class AdminUser < ApplicationRecord
  has_many :audit_events, dependent: :restrict_with_exception

  validates :email,     presence: true, uniqueness: true
  validates :full_name, presence: true
  validates :role,      presence: true
end
