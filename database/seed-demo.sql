INSERT INTO companies(id,name) VALUES('00000000-0000-4000-8000-000000000001','Wind Planner - Demonstração') ON CONFLICT DO NOTHING;
INSERT INTO parks(id,company_id,name,client,region,state,capacity,turbines,manager)
VALUES('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','Complexo Eólico Serra do Mel','Cliente Demo','Nordeste','RN',320,92,'Ricardo Almeida')
ON CONFLICT DO NOTHING;