#!/usr/bin/env ruby
# Usage: scripts/scaffold-workflow.rb <workflow_snake> <resource_snake>
# Example: scripts/scaffold-workflow.rb company_merchant company

require "optparse"
require_relative "lib/scaffold/naming"
require_relative "lib/scaffold/permissions_yaml"
require_relative "lib/scaffold/generator"

opts = { root: File.expand_path("..", __dir__) }
parser = OptionParser.new do |o|
  o.banner = "Usage: scripts/scaffold-workflow.rb <workflow_snake> <resource_snake> [--root DIR]"
  o.on("--root DIR", "Helm repo root (default: this repo)") { |v| opts[:root] = v }
end
parser.parse!

unless ARGV.length == 2
  warn parser.help
  exit 1
end

workflow, resource = ARGV
naming    = Scaffold::Naming.new(workflow: workflow, resource: resource)
generator = Scaffold::Generator.new(root: opts[:root], naming: naming)
generator.run!

puts <<~OUT
  Scaffolded #{workflow} (#{resource}).

  Files written under #{opts[:root]}:
    app/api/entities/#{naming.resource_singular}.rb
    app/api/helm_api/v1/#{naming.workflow_snake}_api.rb
    app/services/hb1_client/#{naming.resource_plural}.rb
    spec/entities/#{naming.resource_singular}_spec.rb
    spec/requests/#{naming.workflow_snake}_spec.rb
    spec/services/hb1_client/#{naming.resource_plural}_spec.rb
    client-helm/src/lib/#{naming.resource_plural}.ts
    client-helm/src/pages/#{naming.page_dir}/{IndexPage,ShowPage,IndexPage.test,ShowPage.test}.tsx
    docs/handoff/#{naming.workflow_snake}.md
    tmp/hb1-out/#{naming.workflow_snake}/*.template

  Next steps (from docs/handoff/#{naming.workflow_snake}.md):
    1. Mount HelmApi::V1::#{naming.api_class} in app/api/helm_api/v1/base.rb
    2. Add /#{naming.resource_plural} route + nav link in client-helm/src/App.tsx
    3. Implement per-workflow writes (Hb1Client method + Grape POST + audit)
    4. Add roles to config/permissions.yml that should have #{naming.permission_view_key}
    5. Hand the tmp/hb1-out/ templates to the HB1 owner of #{naming.resource_singular}

  Run: bundle exec rspec spec/requests/#{naming.workflow_snake}_spec.rb && \\
       (cd client-helm && bun run test src/pages/#{naming.page_dir})
OUT
