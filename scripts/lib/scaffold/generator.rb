require "erb"
require "fileutils"

module Scaffold
  class Generator
    TEMPLATE_ROOT = File.expand_path("../../templates", __dir__)

    HELM_TEMPLATES = [
      ["helm/entity.rb.erb",          ->(n) { "app/api/entities/#{n.resource_singular}.rb" }],
      ["helm/hb1_client.rb.erb",      ->(n) { "app/services/hb1_client/#{n.resource_plural}.rb" }],
      ["helm/api.rb.erb",             ->(n) { "app/api/helm_api/v1/#{n.resource_plural}_api.rb" }],
      ["helm/request_spec.rb.erb",    ->(n) { "spec/requests/#{n.workflow_snake}_spec.rb" }],
      ["helm/entity_spec.rb.erb",     ->(n) { "spec/entities/#{n.resource_singular}_spec.rb" }],
      ["helm/hb1_client_spec.rb.erb", ->(n) { "spec/services/hb1_client/#{n.resource_plural}_spec.rb" }],
      ["helm/lib_typed_api.ts.erb",   ->(n) { "client-helm/src/lib/#{n.resource_plural}.ts" }],
      ["helm/index_page.tsx.erb",     ->(n) { "client-helm/src/pages/#{n.page_dir}/IndexPage.tsx" }],
      ["helm/show_page.tsx.erb",      ->(n) { "client-helm/src/pages/#{n.page_dir}/ShowPage.tsx" }],
      ["helm/index_page_test.tsx.erb",->(n) { "client-helm/src/pages/#{n.page_dir}/IndexPage.test.tsx" }],
      ["helm/show_page_test.tsx.erb", ->(n) { "client-helm/src/pages/#{n.page_dir}/ShowPage.test.tsx" }],
      ["helm/handoff.md.erb",         ->(n) { "docs/handoff/#{n.workflow_snake}.md" }],
    ].freeze

    HB1_TEMPLATES = %w[rpa_api.rb.template service.rb.template entity.rb.template handoff.md.template].freeze

    def initialize(root:, naming:)
      @root = root
      @n    = naming
    end

    def run!
      render_helm_templates!
      copy_hb1_templates!
      append_permissions!
      mount_api_in_base!
    end

    private

    def render_helm_templates!
      HELM_TEMPLATES.each do |template_rel, target_proc|
        template = File.read(File.join(TEMPLATE_ROOT, template_rel))
        rendered = ERB.new(template, trim_mode: "-").result(binding_for_template)
        target = File.join(@root, target_proc.call(@n))
        FileUtils.mkdir_p(File.dirname(target))
        File.write(target, rendered)
      end
    end

    def copy_hb1_templates!
      out_dir = File.join(@root, "tmp", "hb1-out", @n.workflow_snake)
      FileUtils.mkdir_p(out_dir)
      HB1_TEMPLATES.each do |name|
        FileUtils.cp(File.join(TEMPLATE_ROOT, "hb1", name), File.join(out_dir, name))
      end
    end

    def append_permissions!
      yml = File.join(@root, "config/permissions.yml")
      unless File.exist?(yml)
        warn "[scaffold] config/permissions.yml not found at #{yml} — skipping append. Add #{@n.permission_view_key} manually."
        return
      end
      PermissionsYaml.new(yml).append!(
        new_permissions: [{ key: @n.permission_view_key, scope: scope_for(@n.resource_singular) }]
      )
    end

    def scope_for(resource)
      case resource
      when "user"     then "human"
      when "company"  then "company"
      when "location" then "location"
      else "object"
      end
    end

    def binding_for_template
      n = @n
      Kernel.binding
    end

    def mount_api_in_base!
      base_path = File.join(@root, "app/api/helm_api/v1/base.rb")
      unless File.exist?(base_path)
        warn "[scaffold] base.rb not found at #{base_path} — add `mount HelmApi::V1::#{@n.api_class}` manually."
        return
      end

      content    = File.read(base_path)
      mount_line = "      mount HelmApi::V1::#{@n.api_class}"

      if content.include?(mount_line)
        puts "[scaffold] #{mount_line.strip} already present in base.rb — skipping."
        return
      end

      # Insert before the final `end` of the Base class block.
      # Uses \s* (not \s+) because the outermost `end` has no leading whitespace.
      updated = content.sub(/^(      mount HelmApi::V1::\w+)\n(\s*end\n\s*end\n\s*end\n\z)/m) do
        "#{$1}\n#{mount_line}\n#{$2}"
      end

      if updated == content
        warn "[scaffold] Could not find insertion point in base.rb — add `#{mount_line.strip}` manually."
        return
      end

      File.write(base_path, updated)
      puts "[scaffold] Mounted #{@n.api_class} in base.rb."
    end
  end
end
