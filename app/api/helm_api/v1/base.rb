module HelmApi
  module V1
    class Base < Grape::API
      version "v1", using: :path
      format :json
      default_format :json

      helpers AuthHelpers

      rescue_from :all do |e|
        Rails.logger.error("[helm_api] #{e.class}: #{e.message}\n#{e.backtrace.first(10).join("\n")}")
        error!({ error: e.class.name, message: e.message }, 500)
      end

      namespace :_probe do
        get :needs_impersonate do
          check_permission!("account.impersonate_user", scope: {})
          { ok: true }
        end
      end

      mount HelmApi::V1::SessionApi
    end
  end
end
