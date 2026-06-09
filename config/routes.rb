Rails.application.routes.draw do
  get "up" => "rails/health#show", as: :rails_health_check

  mount HelmApi::V1::Base => "/helm_api"
end
