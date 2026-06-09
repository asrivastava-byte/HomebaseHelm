class AuditEvent < ApplicationRecord
  belongs_to :admin_user

  validates :role, :workflow, :action, :resource_type, :resource_id,
            :request_id, :occurred_at, presence: true

  scope :for_resource, ->(type, id) { where(resource_type: type, resource_id: id).order(occurred_at: :desc) }
end
