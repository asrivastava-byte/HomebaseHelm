module Scaffold
  class PermissionsYaml
    def initialize(path)
      @path = path
      @text = File.read(path)
    end

    def append!(new_permissions:)
      lines_to_add = new_permissions.reject { |p| @text.include?(p[:key]) }
      return if lines_to_add.empty?

      formatted = lines_to_add.map { |p| "  - { key: #{p[:key]}, scope: #{p[:scope]} }" }
      roles_index = @text.index(/^roles:/)
      raise "no `roles:` block in #{@path}" unless roles_index

      head = @text[0...roles_index].rstrip
      tail = @text[roles_index..]

      File.write(@path, "#{head}\n#{formatted.join("\n")}\n\n#{tail}")
    end
  end
end
