module HelmApi
  module V1
    module AuthHelpers
      def current_principal
        env[:helm_principal]
      end

      def check_permission!(permission_key, scope: {})
        PermissionService.check!(current_principal, permission_key, scope: scope)
      rescue PermissionService::Forbidden => e
        error!({ error: "forbidden", reason: e.message }, 403)
      end
    end
  end
end
