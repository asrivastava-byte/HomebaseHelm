if ENV["DD_API_KEY"].present?
  require "datadog/auto_instrument"
  Datadog.configure do |c|
    c.service = "helm"
    c.env     = ENV.fetch("DD_ENV", Rails.env)
    c.tracing.instrument :rails
    c.tracing.instrument :rack
    c.tracing.instrument :faraday
  end
else
  Rails.logger.info("[datadog] DD_API_KEY absent — tracing disabled")
end
