require_relative "boot"

require "rails/all"

Bundler.require(*Rails.groups)

module Helm
  class Application < Rails::Application
    config.load_defaults 7.2

    config.autoload_lib(ignore: %w[assets tasks])
    config.autoload_paths       += %W[#{config.root}/app/api #{config.root}/app/middleware]
    config.eager_load_paths     += %W[#{config.root}/app/api #{config.root}/app/middleware]

    config.api_only = true

    config.generators do |g|
      g.test_framework :rspec, fixtures: false, view_specs: false, helper_specs: false,
                               routing_specs: false, controller_specs: true, request_specs: true
    end
  end
end
