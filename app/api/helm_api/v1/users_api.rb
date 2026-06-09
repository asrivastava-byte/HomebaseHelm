module HelmApi
  module V1
    class UsersApi < Grape::API
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

      resource :users do
        params do
          optional :q, type: String
        end
        get do
          check_permission!("account.view_user", scope: {})
          Hb1Client::Users.search(params[:q].to_s)
        end

        route_param :id, type: Integer do
          get do
            check_permission!("account.view_user", scope: { human_id: params[:id] })
            user = Hb1Client::Users.show(params[:id])
            present user, with: Entities::User, role: current_principal
          end

          post :verification_sms do
            check_permission!("account.verify_phone", scope: { human_id: params[:id] })
            result = Hb1Client::Users.send_verification_sms(params[:id])
            AuditService.record(
              actor:         lookup_admin_user!,
              workflow:      "user_lookup",
              action:        "user.verification_sms_sent",
              resource_type: "User",
              resource_id:   params[:id],
              payload_after: { sent_at: result["sent_at"], provider_request_id: result["provider_request_id"] }
            )
            present result, with: Entities::VerificationResult
          end

          post :impersonate do
            check_permission!("account.impersonate_user", scope: { human_id: params[:id] })
            token = Hb1Client::Users.issue_impersonation_token(params[:id])
            AuditService.record(
              actor:         lookup_admin_user!,
              workflow:      "user_lookup",
              action:        "user.impersonation_started",
              resource_type: "User",
              resource_id:   params[:id],
              payload_after: { expires_at: token["expires_at"] }
            )
            present token, with: Entities::ImpersonationToken
          end
        end
      end
    end
  end
end
