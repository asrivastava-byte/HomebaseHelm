class DemoIdentity
  def initialize(app)
    if Rails.env.production?
      raise "DemoIdentity is a development-only stub. " \
            "In production, replace it with a Stytch JWT middleware. " \
            "See docs/AUTH.md for the swap guide."
    end
    @app = app
  end

  def call(env)
    role = parse_cookie(env, "HELM_DEMO_ROLE") || ENV["HELM_DEMO_ROLE"] || "cs_t1_agent"
    env[:helm_principal] = PermissionService::Principal.new(
      id: 1, role: role, stytch_subject: nil
    )

    CurrentRequest.ip         = env["REMOTE_ADDR"]
    CurrentRequest.request_id = env["HTTP_X_REQUEST_ID"] || SecureRandom.uuid

    @app.call(env)
  ensure
    CurrentRequest.reset!
  end

  private

  def parse_cookie(env, name)
    header = env["HTTP_COOKIE"]
    return nil if header.nil? || header.empty?

    header.split(/;\s*/).each do |pair|
      k, v = pair.split("=", 2)
      return v if k == name
    end
    nil
  end
end
