module HelmApi
  module V1
    class SessionApi < Grape::API
      helpers AuthHelpers

      resource :session do
        get do
          {
            role:            current_principal.role,
            permissions:     PermissionService.permissions_for(current_principal),
            available_roles: PermissionService.available_roles
          }
        end
      end
    end
  end
end
