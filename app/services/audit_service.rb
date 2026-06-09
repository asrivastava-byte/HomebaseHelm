class AuditService
  def self.record(actor:, workflow:, action:, resource_type:, resource_id:,
                  payload_before: nil, payload_after: nil)
    event = AuditEvent.create!(
      admin_user_id:  actor.id,
      role:           actor.role,
      workflow:       workflow,
      action:         action,
      resource_type:  resource_type,
      resource_id:    resource_id,
      payload_before: payload_before,
      payload_after:  payload_after,
      request_id:     CurrentRequest.request_id || SecureRandom.uuid,
      ip:             CurrentRequest.ip,
      occurred_at:    Time.current
    )

    Rails.logger.info({
      event:           "helm.audit",
      audit_event_id:  event.id,
      admin_user_id:   actor.id,
      role:            actor.role,
      workflow:        workflow,
      action:          action,
      resource:        "#{resource_type}##{resource_id}",
      request_id:      event.request_id
    }.to_json)

    event
  end
end
