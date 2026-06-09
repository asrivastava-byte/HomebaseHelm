module PermissionService
  class AuthZBackend
    def check(_principal, _permission_key, _scope)
      raise NotImplementedError, "AuthZBackend stub — wire to AuthZ gRPC when admin-rep reconciliation lands"
    end

    def permissions_for(_principal)
      raise NotImplementedError, "AuthZBackend stub"
    end

    def available_roles
      raise NotImplementedError, "AuthZBackend stub"
    end
  end
end
