Rails.application.configure do
  config.lograge.enabled = true
  config.lograge.formatter = Lograge::Formatters::Json.new
  config.lograge.custom_payload do |controller|
    request = controller.request
    principal = request.env[:helm_principal]
    {
      admin_user_id: principal&.id,
      role:          principal&.role,
      request_id:    request.request_id
    }
  end
end
