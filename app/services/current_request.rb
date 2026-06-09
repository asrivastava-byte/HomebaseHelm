class CurrentRequest
  class << self
    def ip
      Thread.current[:helm_current_request_ip]
    end

    def ip=(value)
      Thread.current[:helm_current_request_ip] = value
    end

    def request_id
      Thread.current[:helm_current_request_id]
    end

    def request_id=(value)
      Thread.current[:helm_current_request_id] = value
    end

    def reset!
      Thread.current[:helm_current_request_ip] = nil
      Thread.current[:helm_current_request_id] = nil
    end
  end
end
