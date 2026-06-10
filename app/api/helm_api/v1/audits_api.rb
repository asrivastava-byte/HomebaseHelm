module HelmApi
  module V1
    class AuditsApi < Grape::API
      helpers AuthHelpers

      resource :audits do
        params do
          requires :resource_type, type: String
          requires :resource_id,   type: Integer
        end
        get do
          events = AuditEvent.for_resource(params[:resource_type], params[:resource_id]).includes(:admin_user)
          events.map do |e|
            {
              id:                e.id,
              admin_user_id:     e.admin_user_id,
              admin_user_email:  e.admin_user&.email,
              admin_user_name:   e.admin_user&.full_name,
              role:              e.role,
              workflow:          e.workflow,
              action:            e.action,
              resource_type:     e.resource_type,
              resource_id:       e.resource_id,
              payload_before:    e.payload_before,
              payload_after:     e.payload_after,
              occurred_at:       e.occurred_at.iso8601
            }
          end
        end
      end
    end
  end
end
