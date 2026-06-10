module Hb1Client
  class Locations
    def self.show(id)
      Base.get("/api/rpa_api/v1/locations/#{id}")
    end

    def self.search(query)
      Base.get("/api/rpa_api/v1/locations", params: { q: query })
    end

    def self.archive_jobs(id)
      Base.post("/api/rpa_api/v1/locations/#{id}/archive_jobs")
    end

    def self.unarchive_jobs(id)
      Base.post("/api/rpa_api/v1/locations/#{id}/unarchive_jobs")
    end
  end
end
