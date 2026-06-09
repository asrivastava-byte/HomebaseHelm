module HelmApi
  module V1
    class CompaniesApi < Grape::API
      helpers AuthHelpers

      helpers do
        def lookup_admin_user!
          AdminUser.find_by(email: "#{current_principal.role}@helm.local") ||
            AdminUser.create!(
              email:     "#{current_principal.role}@helm.local",
              full_name: current_principal.role,
              role:      current_principal.role
            )
        end
      end

      resource :companies do
        params do
          optional :q, type: String
        end
        get do
          check_permission!("account.view_company", scope: {})
          Hb1Client::Companies.search(params[:q].to_s)
        end

        route_param :id, type: Integer do
          get do
            check_permission!("account.view_company", scope: { id: params[:id] })
            obj = Hb1Client::Companies.show(params[:id])
            present obj, with: Entities::Company, role: current_principal
          end

          # Per-workflow writes go here. Each should:
          # 1. check_permission!("<domain>.<verb>_<resource>", scope: ...)
          # 2. Call Hb1Client::Companies.<method>(...)
          # 3. AuditService.record(actor: lookup_admin_user!, workflow: "company_merchant",
          #                        action: "company.<verb>", resource_type: "Company",
          #                        resource_id: params[:id], payload_after: { ... })
          # 4. present result, with: Entities::<SomeResultEntity>
        end
      end
    end
  end
end
