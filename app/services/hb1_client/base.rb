require "faraday"

module Hb1Client
  class Error < StandardError; end

  class Base
    def self.connection
      Faraday.new(url: ENV.fetch("HB1_API_BASE_URL")) do |f|
        f.request  :json
        f.response :json, content_type: /\bjson$/
        f.adapter  Faraday.default_adapter
      end
    end

    def self.get(path, params: {})
      request(:get, path, params: params)
    end

    def self.post(path, body: {})
      request(:post, path, body: body)
    end

    def self.patch(path, body: {})
      request(:patch, path, body: body)
    end

    def self.request(method, path, params: {}, body: {})
      response = connection.public_send(method, path) do |req|
        req.headers["Authorization"] = "Bearer #{ENV.fetch('HB1_API_TOKEN')}"
        req.headers["Accept"]        = "application/json"
        req.params  = params if params.any?
        req.body    = body   if body.any?
      end

      unless response.success?
        raise Error, "HB1 #{method.upcase} #{path} returned #{response.status}: #{response.body.inspect}"
      end

      response.body
    end
  end
end
