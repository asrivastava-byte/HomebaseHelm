module Scaffold
  class Naming
    SNAKE = /\A[a-z][a-z0-9_]*\z/

    attr_reader :workflow_snake, :resource_singular

    def initialize(workflow:, resource:)
      raise ArgumentError, "workflow must be snake_case, got #{workflow.inspect}" unless workflow =~ SNAKE
      raise ArgumentError, "resource must be snake_case, got #{resource.inspect}" unless resource =~ SNAKE
      @workflow_snake    = workflow
      @resource_singular = resource
    end

    def workflow_camel        = camelize(@workflow_snake)
    def resource_plural       = pluralize(@resource_singular)
    def resource_class        = camelize(@resource_singular)
    def resource_plural_camel = camelize(resource_plural)
    def page_dir              = workflow_camel
    def api_class             = "#{resource_plural_camel}Api"
    def audit_workflow        = @workflow_snake
    def permission_module     = "account"
    def permission_view_key   = "#{permission_module}.view_#{@resource_singular}"

    private

    def camelize(snake) = snake.split("_").map(&:capitalize).join
    def pluralize(word)
      case word
      when /y\z/ then word.sub(/y\z/, "ies")
      when /s\z/, /x\z/, /ch\z/, /sh\z/ then "#{word}es"
      else "#{word}s"
      end
    end
  end
end
