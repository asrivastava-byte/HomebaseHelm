module HelmApi
  module V1
    class LocationsApi < Grape::API
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

      resource :locations do
        params do
          optional :q, type: String
        end
        get do
          check_permission!("account.view_location", scope: {})
          Hb1Client::Locations.search(params[:q].to_s)
        end

        route_param :id, type: Integer do
          get do
            check_permission!("account.view_location", scope: { id: params[:id] })
            obj = Hb1Client::Locations.show(params[:id])
            present obj, with: Entities::Location, role: current_principal
          end

          post :archive_jobs do
            check_permission!("account.archive_location_jobs", scope: { location_id: params[:id] })
            result = Hb1Client::Locations.archive_jobs(params[:id])
            AuditService.record(
              actor:         lookup_admin_user!,
              workflow:      "location_management",
              action:        "location.jobs_archived",
              resource_type: "Location",
              resource_id:   params[:id],
              payload_after: {
                archived_job_count: result["archived_job_count"],
                archived_at:        result["archived_at"]
              }
            )
            present result, with: Entities::ArchiveJobsResult
          end

          post :unarchive_jobs do
            check_permission!("account.archive_location_jobs", scope: { location_id: params[:id] })
            result = Hb1Client::Locations.unarchive_jobs(params[:id])
            AuditService.record(
              actor:         lookup_admin_user!,
              workflow:      "location_management",
              action:        "location.jobs_unarchived",
              resource_type: "Location",
              resource_id:   params[:id],
              payload_after: {
                unarchived_job_count: result["unarchived_job_count"],
                unarchived_at:        result["unarchived_at"]
              }
            )
            present result, with: Entities::UnarchiveJobsResult
          end

          params do
            requires :user_id, type: Integer
          end
          post :impersonate do
            check_permission!("account.impersonate_user", scope: { location_id: params[:id], human_id: params[:user_id] })
            token = Hb1Client::Users.issue_impersonation_token(params[:user_id])
            AuditService.record(
              actor:         lookup_admin_user!,
              workflow:      "location_management",
              action:        "location.user_impersonated",
              resource_type: "Location",
              resource_id:   params[:id],
              payload_after: {
                user_id:    params[:user_id],
                expires_at: token["expires_at"]
              }
            )
            present token, with: Entities::ImpersonationToken
          end
        end
      end
    end
  end
end
