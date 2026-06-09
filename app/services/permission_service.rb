module PermissionService
  Principal = Struct.new(:id, :role, :stytch_subject, keyword_init: true) do
    def can?(permission_key)
      PermissionService.permissions_for(self).any? do |p|
        p == permission_key || (p.end_with?(".*") && permission_key.start_with?(p[0..-3]))
      end
    end
  end

  Decision  = Struct.new(:allowed?, :reason, keyword_init: true)

  class Forbidden < StandardError; end

  def self.backend
    @backend ||= case ENV.fetch("HELM_PERMISSION_BACKEND", "yaml")
                 when "yaml"  then YamlBackend.new(Rails.root.join("config/permissions.yml"))
                 when "authz" then AuthZBackend.new
                 else raise ArgumentError, "unknown HELM_PERMISSION_BACKEND"
                 end
  end

  def self.reset_backend!
    @backend = nil
  end

  def self.check!(principal, permission_key, scope:)
    decision = backend.check(principal, permission_key, scope)
    raise Forbidden, decision.reason unless decision.allowed?
  end

  def self.permissions_for(principal)
    backend.permissions_for(principal)
  end

  def self.available_roles
    backend.available_roles
  end
end
