require "rails_helper"

RSpec.describe DemoIdentity do
  let(:downstream) do
    lambda do |env|
      [200, {}, [env[:helm_principal].role]]
    end
  end

  subject(:middleware) { described_class.new(downstream) }

  it "defaults to cs_t1_agent when no cookie or env override" do
    ENV.delete("HELM_DEMO_ROLE")
    env = Rack::MockRequest.env_for("/")
    _, _, body = middleware.call(env)
    expect(body.first).to eq("cs_t1_agent")
  end

  it "reads the HELM_DEMO_ROLE cookie" do
    env = Rack::MockRequest.env_for("/", "HTTP_COOKIE" => "HELM_DEMO_ROLE=cs_t2_escalations; other=foo")
    _, _, body = middleware.call(env)
    expect(body.first).to eq("cs_t2_escalations")
  end

  it "falls back to ENV when cookie absent" do
    ENV["HELM_DEMO_ROLE"] = "eng_power"
    env = Rack::MockRequest.env_for("/")
    _, _, body = middleware.call(env)
    expect(body.first).to eq("eng_power")
    ENV.delete("HELM_DEMO_ROLE")
  end

  it "sets CurrentRequest.ip and request_id for the request" do
    env = Rack::MockRequest.env_for("/", "REMOTE_ADDR" => "10.0.0.1", "HTTP_X_REQUEST_ID" => "req-xyz")
    middleware.call(env)
    expect(env[:helm_principal]).to be_a(PermissionService::Principal)
  end
end
