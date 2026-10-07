

CREATE TABLE Timeslots(
    tid INT AUTO_INCREMENT PRIMARY KEY,
    `start` INT NOT NULL,
    `end` INT NOT NULL
);

CREATE TABLE Coaches(
    cid INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    phone VARCHAR(50) NOT NULL
);

CREATE TABLE EquipmentInventory(
    eid INT AUTO_INCREMENT PRIMARY KEY,
    item VARCHAR(50) NOT NULL UNIQUE,
    quantity INT DEFAULT 0,
    fid INT NOT NULL,
    FOREIGN KEY(fid) REFERENCES Facilities(fid)
);

CREATE TABLE Bookings(
    bid INT AUTO_INCREMENT PRIMARY KEY,
    uid INT NOT NULL,
    fid INT NOT NULL,
    cid INT DEFAULT NULL,
    tid INT NOT NULL,
    booking_date DATE NOT NULL,
    FOREIGN KEY(uid) REFERENCES Users(uid),
    FOREIGN KEY(fid) REFERENCES Facilities(fid),
    FOREIGN KEY(cid) REFERENCES Coaches(cid),
    FOREIGN KEY(tid) REFERENCES Timeslots(tid),
    UNIQUE KEY uq_facility_date_slot (fid, booking_date, tid),
    UNIQUE KEY uq_coach_date_slot (cid, booking_date, tid)
);

CREATE TABLE EquipmentUsage(
    usage_id INT AUTO_INCREMENT PRIMARY KEY,
    eid INT NOT NULL,
    quantity_used INT NOT NULL,
    bid INT DEFAULT NULL,
    FOREIGN KEY(eid) REFERENCES EquipmentInventory(eid),
    FOREIGN KEY(bid) REFERENCES Bookings(bid)
);


CREATE VIEW BookingDetails AS
SELECT b.bid, b.booking_date, u.name AS username, f.fname AS facility, f.fsport AS sport,
       t.`start`, t.`end`, c.name AS coach
FROM Bookings b
JOIN Users u ON b.uid = u.uid
JOIN Facilities f ON b.fid = f.fid
JOIN Timeslots t ON b.tid = t.tid
LEFT JOIN Coaches c ON b.cid = c.cid;

CREATE VIEW UserBookings AS
SELECT u.uid, u.name, b.bid, b.booking_date, f.fname AS facility, t.`start`, t.`end`
FROM Users u
JOIN Bookings b ON u.uid = b.uid
JOIN Facilities f ON b.fid = f.fid
JOIN Timeslots t ON b.tid = t.tid;

CREATE VIEW FacilityBookings AS
SELECT f.fid, f.fname, f.fsport, b.bid, b.booking_date, t.`start`, t.`end`
FROM Facilities f
JOIN Bookings b ON f.fid = b.fid
JOIN Timeslots t ON b.tid = t.tid;

CREATE VIEW CoachBookings AS
SELECT c.cid, c.name AS coach, b.bid, b.booking_date, f.fname AS facility, t.`start`, t.`end`
FROM Coaches c
JOIN Bookings b ON c.cid = b.cid
JOIN Facilities f ON b.fid = f.fid
JOIN Timeslots t ON b.tid = t.tid;

CREATE VIEW EquipmentDetails AS
SELECT e.eid, e.item, e.quantity, f.fname AS facility, f.fsport AS sport
FROM EquipmentInventory e
JOIN Facilities f ON e.fid = f.fid;

CREATE VIEW AvailableEquipment AS
SELECT eid, item, quantity
FROM EquipmentInventory
WHERE quantity > 0;

CREATE VIEW AvailableTimeslots AS
SELECT tid, `start`, `end`
FROM Timeslots;


DELIMITER //

CREATE TRIGGER check_double_booking
BEFORE INSERT ON Bookings
FOR EACH ROW
BEGIN
    IF EXISTS(
        SELECT 1
        FROM Bookings
        WHERE fid = NEW.fid
        AND tid = NEW.tid
        AND booking_date = NEW.booking_date
    ) THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Facility is already booked for this time slot';
    END IF;
END //

CREATE TRIGGER check_equipment_quantity
BEFORE INSERT ON EquipmentInventory
FOR EACH ROW
BEGIN
    IF NEW.quantity < 0 THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Equipment quantity cannot be negative';
    END IF;
END //

CREATE TRIGGER check_equipment_usage
BEFORE INSERT ON EquipmentUsage
FOR EACH ROW
BEGIN
    IF NEW.quantity_used < 0 THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Equipment quantity cannot be negative';
    ELSEIF NEW.quantity_used >
        (SELECT quantity FROM EquipmentInventory WHERE eid = NEW.eid) THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Not enough equipment available';
    END IF;
END //

CREATE TRIGGER reduce_equipment
AFTER INSERT ON EquipmentUsage
FOR EACH ROW
BEGIN
    UPDATE EquipmentInventory
    SET quantity = quantity - NEW.quantity_used
    WHERE eid = NEW.eid;
END //

CREATE TRIGGER check_update_quantity
BEFORE UPDATE ON EquipmentInventory
FOR EACH ROW
BEGIN
    IF NEW.quantity < 0 THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Equipment quantity cannot be negative';
    END IF;
END //

DELIMITER ;

-- ---------- SAMPLE DATA ----------

INSERT INTO Users(uid, name, phone) VALUES
(1, 'Rahul Sharma', '9876543210'),
(2, 'Priya Mehta', '9123456780'),
(3, 'Amit Verma', '9988776655'),
(4, 'Sneha Iyer', '9012345678'),
(5, 'Karan Singh', '9345678901'),
(6, 'Neha Kapoor', '9456123780');

INSERT INTO Facilities(fid, fsport, fname) VALUES
(1, 'Football', 'Turf A'),
(2, 'Cricket', 'Turf B'),
(3, 'Badminton', 'Court 1'),
(4, 'Tennis', 'Court 2'),
(5, 'Basketball', 'Court 3');

INSERT INTO Timeslots(tid, `start`, `end`) VALUES
(1, 10, 11),
(2, 11, 12),
(3, 12, 13),
(4, 13, 14),
(5, 14, 15),
(6, 15, 16),
(7, 16, 17),
(8, 17, 18),
(9, 18, 19),
(10, 19, 20),
(11, 20, 21),
(12, 21, 22);

INSERT INTO Coaches(cid, name, phone) VALUES
(1, 'Suresh Patil', '9800011111'),
(2, 'Anita Desai', '9800022222'),
(3, 'Vikram Rao', '9800033333'),
(4, 'Meera Nair', '9800044444');

INSERT INTO EquipmentInventory(eid, item, quantity, fid) VALUES
(1, 'Football', 10, 1),
(2, 'Training Cones', 30, 1),
(3, 'Cricket Bat', 8, 2),
(4, 'Cricket Ball', 20, 2),
(5, 'Badminton Racket', 12, 3),
(6, 'Shuttlecock Box', 4, 3),
(7, 'Tennis Racket', 6, 4),
(8, 'Tennis Ball Can', 15, 4),
(9, 'Basketball', 9, 5);

INSERT INTO Bookings(bid, uid, fid, cid, tid, booking_date) VALUES
(1, 1, 1, 1, 1, CURDATE()),
(2, 2, 3, 2, 2, CURDATE()),
(3, 3, 2, NULL, 3, CURDATE()),
(4, 4, 4, 3, 5, CURDATE()),
(5, 5, 5, NULL, 8, CURDATE()),
(6, 1, 1, NULL, 9, CURDATE()),
(7, 6, 3, 2, 10, CURDATE()),
(8, 2, 2, 1, 11, CURDATE());


INSERT INTO EquipmentUsage(eid, quantity_used) VALUES
(1, 2),
(3, 1),
(5, 4),
(8, 3),
(9, 1);



SELECT (SELECT COUNT(*) FROM Users) AS users,
       (SELECT COUNT(*) FROM Facilities) AS facilities,
       (SELECT COUNT(*) FROM Timeslots) AS timeslots,
       (SELECT COUNT(*) FROM Coaches) AS coaches,
       (SELECT COUNT(*) FROM EquipmentInventory) AS equipment,
       (SELECT COUNT(*) FROM Bookings) AS bookings;
