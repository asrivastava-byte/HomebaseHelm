require "yaml"

module PermissionService
  class YamlBackend
    class InvalidPermissionsFile < StandardError; end

    WILDCARD_ALLOWED_ROLE = "eng_power".freeze

    def initialize(path)
      @path = path.to_s
      @data = YAML.load_file(@path)
      @permission_keys = (@data.fetch("permissions") || []).map { |p| p.fetch("key") }.to_set
      @roles = @data.fetch("roles") || {}
      validate!
    end

    def check(principal, permission_key, _scope)
      perms = permissions_for(principal)
      return Decision.new(allowed?: false, reason: "unknown role: #{principal.role}") if perms.nil?

      allowed = perms.any? do |p|
        p == permission_key || (p.end_with?(".*") && permission_key.start_with?(p[0..-3]))
      end
      Decision.new(
        allowed?: allowed,
        reason:   allowed ? nil : "role=#{principal.role} lacks permission=#{permission_key}"
      )
    end

    def permissions_for(principal)
      role = @roles[principal.role]
      return nil if role.nil?
      role.fetch("permissions", [])
    end

    def available_roles
      @roles.keys
    end

    private

    def validate!
      @roles.each do |role_name, role_def|
        Array(role_def["permissions"]).each do |perm|
          if perm.end_with?(".*")
            if role_name != WILDCARD_ALLOWED_ROLE
              raise InvalidPermissionsFile,
                "wildcards are only allowed for #{WILDCARD_ALLOWED_ROLE} (role=#{role_name} perm=#{perm})"
            end
          else
            unless @permission_keys.include?(perm)
              raise InvalidPermissionsFile, "unknown permission '#{perm}' for role '#{role_name}'"
            end
          end
        end
      end
    end
  end
end
